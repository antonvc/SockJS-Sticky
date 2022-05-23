import { aws_ec2, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as cdk8s from 'cdk8s';
import { KubeDeployment, KubeService, IntOrString, KubeNamespace } from '../imports/k8s';
import * as path from 'path';


//we want to pass the image URL to the graph as it's dynamic and depends on where the image is pushed to during runtime
export interface SockJsProps {
  readonly image: string;
  readonly ns: string;
  readonly replicas: number;
  readonly surge: string;
  readonly deregistration: number;
  readonly nlb_deregistration: number;

}

//create the stack
//this stack creates a EKS cluster with the ALB controller, builds and deploys a SockJS demo application to showcase stickiness support
export class SockjsStickyCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);



    //create an EKS cluster (Includes VPC/subnets,...) with a fargate profile
    const cluster = new eks.Cluster(this, 'SockJsSticky', {
      version: eks.KubernetesVersion.V1_21,
      albController: {
        version: eks.AlbControllerVersion.V2_3_1,
      },
      defaultCapacity: 0
    });

    /*cluster.addFargateProfile('sockjs', {
      selectors: [ { namespace: namespace } ]
    });*/
    cluster.addNodegroupCapacity('spot_ng', {
      instanceTypes: [
        new aws_ec2.InstanceType('m5.large'),
        new aws_ec2.InstanceType('m5a.large'),
        new aws_ec2.InstanceType('m5d.large'),
      ],
      minSize: 2,
      capacityType: eks.CapacityType.SPOT,
    });

    //build the docker image and push it to ECR
    const asset = new DockerImageAsset(this, 'SockJsImage', {
      directory: path.join(__dirname, '../app'),
    });

    //define service properties
    const properties:SockJsProps = { 
      image: asset.imageUri, 
      ns: 'sockjs', 
      replicas: 20, 
      surge: '50%',
      deregistration: 180, //accomodate NLB internal de-registration delay
      nlb_deregistration: 0
    }

    //create the chart containing our Kubernetes definitions
    const sockJsChart = new SockJsChart(new cdk8s.App(), 'sockJS', properties);

    // add the cdk8s chart to the cluster
    cluster.addCdk8sChart('sockJS', sockJsChart);
  }
}
//cdk8s chart definition
class SockJsChart extends cdk8s.Chart {
  constructor(scope: Construct, id: string, props: SockJsProps) {
    super(scope, id);

    //specify the labels
    const label = { app: 'sockjs' };
    
    new KubeNamespace(this, 'namespace', {
      metadata: { 
        name: props.ns, 
        labels:{
          'elbv2.k8s.aws/pod-readiness-gate-inject': 'enabled'
        } 
      }
    });
  
    //define the service
    //important here are the annotation as they enable the stickiness on the loadbalancer
    new KubeService(this, 'service', {
      spec: {
        type: 'LoadBalancer',
        ports: [ { port: 80, targetPort: IntOrString.fromNumber(9999) } ],
        selector: label,
      },
      metadata: { 
        namespace: props.ns, 
        annotations:{
          'service.beta.kubernetes.io/aws-load-balancer-type': 'external',
          'service.beta.kubernetes.io/aws-load-balancer-nlb-target-type': 'ip',
          'service.beta.kubernetes.io/aws-load-balancer-scheme': 'internet-facing',
          'service.beta.kubernetes.io/aws-load-balancer-target-group-attributes': 'stickiness.enabled=true,stickiness.type=source_ip,deregistration_delay.connection_termination.enabled=false,deregistration_delay.timeout_seconds='+props.nlb_deregistration,
          'service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled': 'true',
        } 
      }
    });

    //create the deployment
    new KubeDeployment(this, 'deployment', {
      metadata: { 
        namespace: props.ns
      },
      spec: {
        replicas: props.replicas,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxSurge: IntOrString.fromString(props.surge),
            maxUnavailable: IntOrString.fromNumber(0),
          },
        },
        selector: {
          matchLabels: label
        },
        template: {
          metadata: { labels: label },
          spec: {
            terminationGracePeriodSeconds: props.deregistration,
            containers: [
              {
                name: 'sockjs',
                image: props.image,
                ports: [ { containerPort: 9999 } ],
                lifecycle: {
                  preStop: {
                    exec: {
                      command: [
                        "sh", "-c",
                        "sleep "+props.deregistration,
                      ]
                    }
                  }                  
                }                  
              }
            ],           
          }
        }
      }
    });
  }
}